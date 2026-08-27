// Pruebas del tipo de archivo que anuncia el proxy de piezas.
//
// Vale la pena probarlo porque el fallo es silencioso y feo: el servidor
// responde 200, el archivo llega entero, y la marca ve un recuadro negro donde
// debería estar el video de la creadora. Nadie lo nota en los logs.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');

const { tipoQueSeSirve } = require('../media');

test('un video marcado se anuncia mp4 aunque el original fuera .mov', () => {
  assert.equal(
    tipoQueSeSirve({ mime: 'video/quicktime', watermark_path: 'wmv-abc.mp4' }),
    'video/mp4'
  );
});

test('un video marcado se anuncia mp4 aunque el original fuera webm', () => {
  // ffmpeg reescribe a H.264 en mp4 pase lo que pase: devolver el mime guardado
  // haría que el navegador intente decodificar webm sobre un archivo mp4.
  assert.equal(
    tipoQueSeSirve({ mime: 'video/webm', watermark_path: 'wmv-abc.mp4' }),
    'video/mp4'
  );
});

test('una imagen marcada se anuncia jpeg aunque el original fuera png', () => {
  assert.equal(
    tipoQueSeSirve({ mime: 'image/png', watermark_path: 'wm-abc.jpg' }),
    'image/jpeg'
  );
});

test('sin marca, un .mov se sigue anunciando como mp4', () => {
  // Chrome y Firefox rechazan "video/quicktime" aunque el video sea H.264.
  assert.equal(tipoQueSeSirve({ mime: 'video/quicktime' }), 'video/mp4');
});

test('sin marca se respeta el mime guardado', () => {
  assert.equal(tipoQueSeSirve({ mime: 'image/webp' }), 'image/webp');
});

test('sin mime guardado se usa el que responde Storage', () => {
  assert.equal(tipoQueSeSirve({}, 'image/avif'), 'image/avif');
});

test('sin nada, un tipo genérico antes que undefined', () => {
  // Un Content-Type vacío hace que el navegador adivine, y con nosniff puesto
  // eso termina en descarga o en nada.
  assert.equal(tipoQueSeSirve({}), 'application/octet-stream');
});
