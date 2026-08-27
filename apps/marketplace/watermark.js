// Marca de agua sobre el contenido del catálogo.
//
// Existe para sostener la promesa central del producto: que la identidad de la
// creadora no se pueda averiguar antes de que el pago quede retenido. Sin esto,
// una marca copia una pieza, la busca en Google Lens y llega a su Instagram —
// y con eso la cláusula de no-circunvalación deja de ser exigible.
//
// ⚠️ Lo que esto SÍ hace y lo que NO:
//
//   SÍ · Marca la procedencia y disuade el uso por fuera de la plataforma.
//   SÍ · Cambia el hash perceptual de la imagen —con un recorte del 5% y una
//        recompresión— que es lo que de verdad dificulta una búsqueda inversa.
//   NO · Hacerla imposible. Nada lo hace, salvo destruir la imagen. Alguien
//        decidido con la pieza original en la mano puede encontrarla.
//
// El recorte es la parte que menos se nota y más protege: un 5% de zoom no
// cambia lo que la marca ve, pero sí las características que usan los buscadores
// de imagen para emparejar.
//
// Se genera UNA VEZ por pieza y se guarda, igual que las portadas. Marcar al
// servir costaría cientos de milisegundos en cada carga del catálogo, que trae
// más de cien imágenes por pantalla.

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ejecutar = promisify(execFile);

// Cuánta presencia tiene la marca. Por encima de ~0.3 empieza a estorbar para
// juzgar el contenido, que es justo para lo que la marca abre el catálogo.
const OPACIDAD = 0.22;
const RECORTE = 0.05;   // 5% por lado: invisible al ojo, notorio para un hash

const RUTA_LOGO = path.join(__dirname, 'assets', 'watermark.png');

/**
 * El filtro de ffmpeg que marca una imagen.
 *
 * Tres pasadas en diagonal en vez de una esquina: una marca sola se recorta en
 * dos segundos. No se usa `tile` —el filtro obvio para repetir— porque pierde
 * el canal alfa y pinta bloques negros sobre la pieza.
 */
function filtroDeMarca() {
  return [
    `[0:v]crop=iw*${1 - RECORTE * 2}:ih*${1 - RECORTE * 2}:iw*${RECORTE}:ih*${RECORTE}[base]`,
    `[1:v]scale=iw*0.9:-1,format=rgba,colorchannelmixer=aa=${OPACIDAD}[m]`,
    '[m]split=3[m1][m2][m3]',
    '[base][m1]overlay=W*0.05:H*0.18[a]',
    '[a][m2]overlay=W*0.28:H*0.48[b]',
    '[b][m3]overlay=W*0.05:H*0.78[out]',
  ].join(';');
}

/** Marca una imagen (JPEG) y devuelve el buffer resultante. */
async function marcarImagen(buffer) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) throw new Error('ffmpeg-static no disponible');

  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-wm-'));
  const entrada = path.join(carpeta, 'in.jpg');
  const salida = path.join(carpeta, 'out.jpg');

  try {
    await fs.writeFile(entrada, buffer);
    await ejecutar(ffmpeg, [
      '-i', entrada, '-i', RUTA_LOGO,
      '-filter_complex', filtroDeMarca(),
      '-map', '[out]', '-frames:v', '1',
      // Se recomprime a propósito: reescribir los coeficientes JPEG es otra
      // capa que aleja la copia del original.
      '-q:v', '4',
      '-y', salida,
    ], { timeout: 60000 });
    return await fs.readFile(salida);
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Marca un video. Es mucho más caro que una imagen porque hay que recodificar.
 *
 * Se baja a 720p y se usa un preset rápido: el catálogo muestra las piezas en
 * un recuadro pequeño, así que la resolución original no aporta nada y sí
 * multiplica el tiempo de proceso y lo que pesa la descarga.
 */
async function marcarVideo(buffer, mime) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) throw new Error('ffmpeg-static no disponible');

  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-wmv-'));
  const ext = String(mime || '').includes('quicktime') ? '.mov' : '.mp4';
  const entrada = path.join(carpeta, 'in' + ext);
  const salida = path.join(carpeta, 'out.mp4');

  try {
    await fs.writeFile(entrada, buffer);
    await ejecutar(ffmpeg, [
      '-i', entrada, '-i', RUTA_LOGO,
      '-filter_complex',
        `[0:v]scale='min(720,iw)':-2,` +
        `crop=iw*${1 - RECORTE * 2}:ih*${1 - RECORTE * 2}:iw*${RECORTE}:ih*${RECORTE}[base];` +
        `[1:v]scale=iw*0.7:-1,format=rgba,colorchannelmixer=aa=${OPACIDAD}[m];` +
        '[m]split=3[m1][m2][m3];' +
        '[base][m1]overlay=W*0.05:H*0.18[a];' +
        '[a][m2]overlay=W*0.28:H*0.48[b];' +
        '[b][m3]overlay=W*0.05:H*0.78[out]',
      '-map', '[out]',
      // Sin audio: el catálogo lo reproduce en silencio y quitarlo ahorra peso
      // y tiempo de proceso.
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      // faststart deja el índice al principio: el video empieza a verse sin
      // descargarse entero.
      '-movflags', '+faststart',
      '-y', salida,
    ], { timeout: 600000, maxBuffer: 1024 * 1024 * 64 });
    return await fs.readFile(salida);
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { marcarImagen, marcarVideo, OPACIDAD, RECORTE, RUTA_LOGO };
