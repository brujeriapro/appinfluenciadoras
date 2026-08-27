// Subida de piezas de muestra al bucket privado.
//
// Vive aparte porque la usan dos lados: el panel admin y la propia creadora
// desde su portal. Duplicar estas validaciones sería la forma más fácil de que
// una de las dos rutas se quede sin ellas.

const fetch = require('node-fetch');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const { marcarImagen, marcarVideo } = require('./watermark');

// Los mismos tipos que acepta el bucket de Storage. Se valida aquí también
// para dar un error entendible en vez de un 400 críptico de Supabase.
//
// Qué NO está en la lista y por qué: HEIC y HEIF, el formato con que graba el
// iPhone. Se podrían guardar, pero Chrome y Firefox no los renderizan — la
// marca vería una imagen rota. El portal convierte toda imagen a JPEG antes de
// subirla, así que este caso no debería llegar; si llega, el mensaje le dice a
// la creadora qué hacer.
const MIMES_IMAGEN = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MIMES_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const MIMES_OK = [...MIMES_IMAGEN, ...MIMES_VIDEO];
/**
 * Cuánto puede pesar una pieza.
 *
 * Estaba en 10 MB y era demasiado poco: un reel de treinta segundos grabado
 * con un celular actual pesa entre 20 y 60 MB. Las creadoras se topaban con un
 * mensaje que les pedía "bajar la calidad".
 *
 * Y ese mensaje era doblemente injusto, porque LA CALIDAD QUE VE LA MARCA NO ES
 * LA DEL ORIGINAL: lo que se sirve es la copia con marca de agua, que
 * generamos nosotros a 720p. El original se guarda y no sale por ninguna ruta.
 * Pedirle a ella que comprima no mejoraba nada — nosotros recomprimimos igual.
 * Lo único que hacía el tope era impedirle subir.
 *
 * El techo de verdad lo pone Supabase Storage (50 MB por defecto en el
 * proyecto). Se deja justo debajo para que el error salga acá, con un mensaje
 * entendible, y no allá con uno críptico.
 */
const MAX_BYTES = Number(process.env.MK_MAX_SUBIDA_MB || 48) * 1024 * 1024;

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
async function subirMuestra(creadora_id, { archivo_base64, buffer: crudo, mime, titulo, origen_url, subida_por = 'admin' }) {
  if (!archivo_base64 && !crudo) throw new ErrorMuestra('Falta el archivo');

  const tipoMime = mime || 'image/jpeg';
  if (!MIMES_OK.includes(tipoMime)) {
    if (/hei[cf]/i.test(tipoMime)) {
      throw new ErrorMuestra(
        'Esa foto está en formato HEIC de iPhone y los navegadores no lo muestran. ' +
        'Tómale una captura de pantalla o cámbiale el formato a JPG.'
      );
    }
    throw new ErrorMuestra(
      `Formato no permitido (${tipoMime}). Se aceptan JPG, PNG, WebP, GIF y video MP4 o MOV.`
    );
  }

  // Los videos llegan en crudo; las fotos, en base64 porque el navegador ya las
  // recomprimió a unos cientos de kilobytes antes de mandarlas.
  const buffer = crudo
    || Buffer.from(String(archivo_base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buffer.length) throw new ErrorMuestra('El archivo llegó vacío');
  if (buffer.length > MAX_BYTES) {
    const tope = Math.round(MAX_BYTES / 1024 / 1024);
    throw new ErrorMuestra(
      `Esa pieza pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB y el máximo son ${tope} MB. `
      + 'Si es un video largo, córtalo — no hace falta que bajes la calidad, '
      + 'nosotros la ajustamos para el catálogo.',
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

  // La extensión del archivo en Storage, normalizada.
  const EXT = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  };
  const ext = EXT[tipoMime] || 'bin';
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
    // Storage exige la llave service_role clásica, en formato JWT. Con la nueva
    // (sb_secret_...) la base de datos funciona y solo fallan las subidas.
    if (/jws|jwt|invalid.*token|signature/i.test(mensaje)) {
      throw new ErrorMuestra(
        'Storage rechazó las credenciales. Revisa que SUPABASE_SERVICE_ROLE_KEY ' +
        'sea la llave clásica (empieza por "eyJ"), no la nueva sb_secret_.',
        502
      );
    }
    throw new ErrorMuestra(`Storage rechazó el archivo (${subida.status}): ${mensaje}`, 502);
  }

  const fila = await db.insertMuestra({
    creadora_id,
    tipo: MIMES_VIDEO.includes(tipoMime) ? 'video' : 'imagen',
    storage_path,
    mime: tipoMime,
    orden: existentes.length,
    titulo: titulo || null,
    origen_url: origen_url || null,
    subida_por,
  });

  marcarEnSegundoPlano(fila, buffer);
  return fila;
}

/**
 * Pone la marca de agua sin hacer esperar a quien subió.
 *
 * A propósito no se espera el resultado: marcar un video toma medio minuto y
 * dejar a la creadora mirando una barra de carga ese rato la haría abandonar.
 * Mientras tanto el proxy sirve el original —ver media.js— así que la pieza se
 * ve desde el primer segundo; lo único que pasa es que unos segundos sale sin
 * marca.
 *
 * Si falla, solo se registra: la pieza ya está guardada y el script
 * `scripts/marcar-contenido.js` recoge después todo lo que quedó sin marcar.
 */
function marcarEnSegundoPlano(fila, buffer) {
  const esVideo = fila.tipo === 'video';
  const trabajo = esVideo ? marcarVideo(buffer, fila.mime) : marcarImagen(buffer);

  trabajo
    .then(async (marcado) => {
      const nombre = `wm-${crypto.randomUUID()}.${esVideo ? 'mp4' : 'jpg'}`;
      await subirBuffer(marcado, nombre, esVideo ? 'video/mp4' : 'image/jpeg');
      await db.actualizarMuestra(fila.id, {
        watermark_path: nombre,
        watermark_at: new Date().toISOString(),
      });
    })
    .catch((e) => console.warn(`[muestras] no se pudo marcar ${fila.id}:`, e.message));
}

/** Sube un buffer con nombre y tipo dados. Devuelve el nombre. */
async function subirBuffer(buffer, nombre, mime) {
  const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/object/${config.supabase.bucket_muestras}/${nombre}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabase.service_role_key}`,
      'Content-Type': mime,
    },
    body: buffer,
  });
  if (!r.ok) throw new Error(`Storage ${r.status}`);
  return nombre;
}

/**
 * Sube un archivo al bucket y devuelve su ruta, sin crear fila en mk_muestras.
 *
 * Lo usan la foto de perfil de la creadora y el logo de la marca: son archivos
 * que viven como columna de su dueño, no como pieza de una galería.
 */
async function subirArchivo({ archivo_base64, mime }) {
  if (!archivo_base64) throw new ErrorMuestra('Falta el archivo');

  const tipoMime = mime || 'image/jpeg';
  if (!MIMES_IMAGEN.includes(tipoMime)) {
    throw new ErrorMuestra(`Formato no permitido (${tipoMime}). Sube una foto JPG, PNG o WebP.`);
  }

  const buffer = Buffer.from(String(archivo_base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buffer.length) throw new ErrorMuestra('El archivo llegó vacío');
  if (buffer.length > MAX_BYTES) {
    throw new ErrorMuestra(
      `La foto pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB. El máximo son 10 MB.`, 413
    );
  }

  const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
                'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const storage_path = `${crypto.randomUUID()}.${EXT[tipoMime] || 'jpg'}`;

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
    const detalle = await subida.text().catch(() => '');
    console.error(`[muestras] Storage ${subida.status}: ${detalle}`);
    throw new ErrorMuestra(`Storage rechazó la foto (${subida.status})`, 502);
  }

  return { storage_path, mime: tipoMime };
}

/** Borra un objeto del bucket, sin tocar la base. */
async function borrarArchivo(storage_path) {
  if (!storage_path) return;
  const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/object/${config.supabase.bucket_muestras}/${storage_path}`;
  try {
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
  } catch (e) {
    console.warn('[muestras] no se pudo borrar del bucket:', e.message);
  }
}

/** Borra la pieza de la base y del bucket. */
async function borrarMuestra(muestra_id) {
  const muestra = await db.getMuestra(muestra_id);
  if (!muestra) throw new ErrorMuestra('Pieza no encontrada', 404);

  // Se borran las cuatro: original, copia marcada, portada y portada marcada.
  // Quitar solo el original dejaría la versión con marca de agua viva en el
  // bucket — que es justamente la que el catálogo sirve.
  //
  // Si el borrado en Storage falla, igual se quita de la base: un archivo
  // huérfano en el bucket es menos grave que una pieza que la creadora quiso
  // quitar y sigue viéndose en el catálogo.
  for (const ruta of [muestra.storage_path, muestra.watermark_path,
                      muestra.poster_path, muestra.watermark_poster_path]) {
    await borrarArchivo(ruta);
  }

  await db.borrarMuestra(muestra_id);
  return muestra;
}

module.exports = { subirMuestra, borrarMuestra, subirArchivo, borrarArchivo,
                   ErrorMuestra, MIMES_OK, MIMES_IMAGEN, MIMES_VIDEO, MAX_BYTES };
