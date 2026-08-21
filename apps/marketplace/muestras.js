// Subida de piezas de muestra al bucket privado.
//
// Vive aparte porque la usan dos lados: el panel admin y la propia creadora
// desde su portal. Duplicar estas validaciones sería la forma más fácil de que
// una de las dos rutas se quede sin ellas.

const fetch = require('node-fetch');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');

// Los mismos tipos y el mismo tope que acepta el bucket de Storage. Se valida
// aquí para dar un error entendible en vez de un 400 críptico de Supabase.
const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
const MAX_BYTES = 10 * 1024 * 1024;

class ErrorMuestra extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * Guarda una pieza y devuelve la fila creada.
 *
 * El nombre del archivo en Storage es aleatorio y no guarda relación con la
 * creadora: si alguien consiguiera listar el bucket, no podría atribuir una
 * pieza a nadie.
 *
 * @param {string} creadora_id
 * @param {object} p
 * @param {string} p.archivo_base64
 * @param {string} [p.mime]
 * @param {string} [p.titulo]
 * @param {string} [p.origen_url]  De qué post salió. Uso interno, nunca se sirve.
 * @param {string} [p.subida_por]  creadora | admin
 */
async function subirMuestra(creadora_id, { archivo_base64, mime, titulo, origen_url, subida_por = 'admin' }) {
  if (!archivo_base64) throw new ErrorMuestra('Falta el archivo');

  const tipoMime = mime || 'image/jpeg';
  if (!MIMES_OK.includes(tipoMime)) {
    throw new ErrorMuestra(`Formato no permitido (${tipoMime}). Se aceptan JPG, PNG, WebP y MP4.`);
  }

  const buffer = Buffer.from(String(archivo_base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buffer.length) throw new ErrorMuestra('El archivo llegó vacío');
  if (buffer.length > MAX_BYTES) {
    throw new ErrorMuestra(
      `La pieza pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB. El máximo son 10 MB.`,
      413
    );
  }

  const existentes = await db.getMuestrasDeCreadora(creadora_id);
  const cfg = await db.getConfig();
  const tope = Number(cfg.max_muestras_por_creadora ?? 6);
  if (existentes.length >= tope) {
    throw new ErrorMuestra(
      `Ya tienes ${tope} piezas, que es el máximo. Borra una para subir otra.`,
      409
    );
  }

  const ext = tipoMime === 'video/mp4' ? 'mp4' : tipoMime.split('/')[1];
  const storage_path = `${crypto.randomUUID()}.${ext}`;

  const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/object/${config.supabase.bucket_muestras}/${storage_path}`;
  const subida = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabase.service_role_key}`,
      'Content-Type': tipoMime,
    },
    body: buffer,
  });
  if (!subida.ok) {
    // Storage responde con un JSON que dice qué falló. Tragárselo y devolver
    // solo el número deja a quien depura adivinando entre "no existe el
    // bucket", "ese tipo no está permitido" y "pesa demasiado".
    const detalle = await subida.text().catch(() => '');
    console.error(`[muestras] Storage ${subida.status}: ${detalle}`);

    let mensaje = detalle;
    try {
      const j = JSON.parse(detalle);
      mensaje = j.message || j.error || detalle;
    } catch (e) { /* no era JSON: se usa el texto crudo */ }

    if (subida.status === 404 || /not found/i.test(mensaje)) {
      throw new ErrorMuestra(
        `No existe el bucket "${config.supabase.bucket_muestras}" en Supabase Storage. Hay que crearlo.`,
        502
      );
    }
    if (/mime|content.?type/i.test(mensaje)) {
      throw new ErrorMuestra(
        `El bucket no acepta archivos ${tipoMime}. Revisa los tipos permitidos en Supabase Storage.`,
        400
      );
    }
    if (/size|large|exceed/i.test(mensaje)) {
      throw new ErrorMuestra('El archivo supera el límite del bucket.', 413);
    }
    throw new ErrorMuestra(`Storage rechazó el archivo (${subida.status}): ${mensaje}`, 502);
  }

  return db.insertMuestra({
    creadora_id,
    tipo: tipoMime.startsWith('video/') ? 'video' : 'imagen',
    storage_path,
    mime: tipoMime,
    orden: existentes.length,
    titulo: titulo || null,
    origen_url: origen_url || null,
    subida_por,
  });
}

/** Borra la pieza de la base y del bucket. */
async function borrarMuestra(muestra_id) {
  const muestra = await db.getMuestra(muestra_id);
  if (!muestra) throw new ErrorMuestra('Pieza no encontrada', 404);

  const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/object/${config.supabase.bucket_muestras}/${muestra.storage_path}`;
  // Si el borrado en Storage falla, igual se quita de la base: una fila
  // huérfana en el bucket es menos grave que una pieza que la creadora quiso
  // quitar y sigue viéndose en el catálogo.
  try {
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
  } catch (e) {
    console.warn('[muestras] no se pudo borrar del bucket:', e.message);
  }

  await db.borrarMuestra(muestra_id);
  return muestra;
}

module.exports = { subirMuestra, borrarMuestra, ErrorMuestra, MIMES_OK, MAX_BYTES };
